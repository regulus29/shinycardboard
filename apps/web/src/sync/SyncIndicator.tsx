import { useNavigate } from 'react-router-dom';
import { cx, Icon, type IconName } from '../ui';
import { ROUTES } from '../app/paths';
import { useSync } from './SyncProvider';
import type { SyncState, SyncStatus } from './engine';
import './sync.css';

const ICONS: Record<SyncStatus, IconName> = {
  idle: 'cloud',
  syncing: 'sync',
  error: 'alert',
  offline: 'cloud-off',
  disabled: 'cloud',
};

const LABELS: Record<SyncStatus, string> = {
  idle: 'Synced',
  syncing: 'Syncing',
  error: 'Sync error',
  offline: 'Offline',
  disabled: 'Sync off',
};

/** Relative time such as "just now" or "5 min ago". */
export function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** `onSettings` swaps the disabled hint, which would otherwise point at the page the user is on. */
export function describeSync(state: SyncState, now: number = Date.now(), onSettings = false): string {
  const last = state.lastSyncedAt ? `Last synced ${formatAgo(state.lastSyncedAt, now)}.` : 'Not synced yet.';
  const pending = state.pending > 0 ? ` ${state.pending} change${state.pending === 1 ? '' : 's'} waiting.` : '';
  switch (state.status) {
    case 'disabled':
      return onSettings ? 'Sync is off. Add a server below to keep devices in step.' : 'Sync is off. Set up a server in Settings.';
    case 'syncing':
      return 'Syncing with your server.';
    case 'offline':
      return `You are offline. Changes are saved on this device.${pending}`;
    case 'error':
      return `${state.error ?? 'Sync failed.'} ${last}${pending}`;
    default:
      return `${last}${pending}`;
  }
}

/** Compact sync status button for the top bar. Click syncs, or opens Settings when sync is off. */
export function SyncIndicator() {
  const { state, syncNow } = useSync();
  const navigate = useNavigate();
  const description = describeSync(state);

  const onClick = () => {
    if (state.status === 'disabled') navigate(ROUTES.settings);
    else void syncNow();
  };

  return (
    <button
      type="button"
      className={cx('sync-indicator', `is-${state.status}`)}
      onClick={onClick}
      title={description}
      aria-label={`${LABELS[state.status]}. ${description}`}
    >
      <Icon name={ICONS[state.status]} className={cx(state.status === 'syncing' && 'sync-indicator__spin')} />
      <span className="sync-indicator__label">{LABELS[state.status]}</span>
      {state.pending > 0 && state.status !== 'disabled' ? <span className="sync-indicator__dot" aria-hidden="true" /> : null}
    </button>
  );
}
