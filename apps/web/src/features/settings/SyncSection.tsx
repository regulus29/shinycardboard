import { useState } from 'react';
import { Badge, Button, TextField, useToast, type BadgeTone } from '../../ui';
import {
  clearSyncConfig,
  describeSync,
  normalizeServerUrl,
  saveSyncConfig,
  testConnection,
  useSync,
  useSyncConfig,
  type SyncStatus,
} from '../../sync';
import { SettingsRow, SettingsSection } from './SettingsSection';

const STATUS_TONE: Record<SyncStatus, BadgeTone> = {
  idle: 'success',
  syncing: 'accent',
  error: 'danger',
  offline: 'warning',
  disabled: 'neutral',
};

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: 'Connected',
  syncing: 'Syncing',
  error: 'Error',
  offline: 'Offline',
  disabled: 'Off',
};

/** Plain http is only acceptable for a server on this machine; elsewhere the token would travel unencrypted. */
export function isInsecureRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    return url.protocol === 'http:' && !local;
  } catch {
    return false;
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SyncSection() {
  const config = useSyncConfig();
  const { state, syncNow, resyncEverything } = useSync();
  const toast = useToast();
  const [url, setUrl] = useState(config?.url ?? '');
  const [token, setToken] = useState(config?.token ?? '');
  const [testing, setTesting] = useState(false);
  const [touched, setTouched] = useState(false);

  const cleanUrl = normalizeServerUrl(url);
  const urlError = touched && cleanUrl && !isValidUrl(cleanUrl) ? 'Enter a full address such as https://sync.example.com' : undefined;
  const canUse = Boolean(cleanUrl) && isValidUrl(cleanUrl);

  const save = () => {
    setTouched(true);
    if (!canUse) return;
    saveSyncConfig({ url: cleanUrl, token });
    toast.show({ title: 'Sync settings saved', tone: 'success' });
  };

  const test = async () => {
    setTouched(true);
    if (!canUse) return;
    setTesting(true);
    const result = await testConnection({ url: cleanUrl, token: token.trim() });
    setTesting(false);
    if (result.ok) toast.show({ title: 'Connection works', description: 'The server accepted the token.', tone: 'success' });
    else toast.show({ title: 'Connection failed', description: result.error, tone: 'danger' });
  };

  const turnOff = () => {
    clearSyncConfig();
    setUrl('');
    setToken('');
    setTouched(false);
    toast.show({ title: 'Sync turned off', description: 'Your data stays on this device.' });
  };

  return (
    <SettingsSection title="Sync" description="Optional. Keep devices in step through your own sync server. Works offline and catches up later.">
      <div className="settings-status">
        <Badge tone={STATUS_TONE[state.status]}>{STATUS_TEXT[state.status]}</Badge>
        <p className="settings-status__text" role="status">
          {describeSync(state, Date.now(), true)}
        </p>
      </div>

      <div className="settings-form">
        <TextField
          label="Server URL"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://sync.example.com"
          value={url}
          error={urlError}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        <TextField
          label="Access token"
          type="password"
          autoComplete="off"
          hint="Kept in plain text in this browser's local storage and sent only to the server above. Anyone with access to this browser profile can read it."
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </div>

      {isInsecureRemoteUrl(cleanUrl) ? (
        <p className="settings-warning" role="note">
          This address uses http, so your token and data travel unencrypted. Use https unless the server is on your own network.
        </p>
      ) : null}

      <div className="settings-actions">
        <Button variant="primary" onClick={save}>
          Save
        </Button>
        <Button icon="check" onClick={test} loading={testing}>
          Test connection
        </Button>
        <Button icon="sync" onClick={() => void syncNow()} disabled={!config || state.status === 'syncing'}>
          Sync now
        </Button>
      </div>

      <SettingsRow label="Resync everything" hint="Sends all records and pulls the server copy again. Use after changing servers or restoring a server.">
        <Button onClick={() => void resyncEverything()} disabled={!config || state.status === 'syncing'}>
          Resync
        </Button>
      </SettingsRow>
      <SettingsRow label="Turn sync off" hint="Your data stays on this device.">
        <Button variant="ghost" onClick={turnOff} disabled={!config && !url && !token}>
          Turn off
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}
