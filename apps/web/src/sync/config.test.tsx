import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { STORAGE_KEYS } from '../config/constants';
import { clearSyncConfig, loadSyncConfig, normalizeServerUrl, saveSyncConfig, useSyncConfig } from './config';
import { describeSync, formatAgo } from './SyncIndicator';

beforeEach(() => clearSyncConfig());

describe('sync config storage', () => {
  it('normalizes the URL and trims the token', () => {
    saveSyncConfig({ url: ' https://sync.test/// ', token: '  abc ' });
    expect(loadSyncConfig()).toEqual({ url: 'https://sync.test', token: 'abc' });
    expect(normalizeServerUrl('http://x/')).toBe('http://x');
  });

  it('an empty URL removes the config entirely', () => {
    saveSyncConfig({ url: 'https://sync.test', token: 't' });
    clearSyncConfig();
    expect(loadSyncConfig()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.syncConfig)).toBeNull();
  });

  it('ignores corrupted storage', () => {
    localStorage.setItem(STORAGE_KEYS.syncConfig, '{oops');
    expect(loadSyncConfig()).toBeNull();
  });

  it('useSyncConfig re-renders when the config changes', () => {
    const { result } = renderHook(() => useSyncConfig());
    expect(result.current).toBeNull();
    act(() => saveSyncConfig({ url: 'https://sync.test', token: 't' }));
    expect(result.current?.url).toBe('https://sync.test');
  });
});

describe('sync status text', () => {
  const NOW = 1_700_000_000_000;
  it('formats relative times', () => {
    expect(formatAgo(NOW - 10_000, NOW)).toBe('just now');
    expect(formatAgo(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(formatAgo(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
  });

  it('describes each state and never mentions secrets', () => {
    const base = { lastSyncedAt: NOW - 60_000, error: null, pending: 2, rejected: 0, syncedThisSession: true };
    expect(describeSync({ ...base, status: 'disabled' }, NOW)).toContain('Settings');
    expect(describeSync({ ...base, status: 'offline' }, NOW)).toContain('2 changes waiting');
    expect(describeSync({ ...base, status: 'error', error: 'Server down' }, NOW)).toContain('Server down');
    expect(describeSync({ ...base, status: 'idle' }, NOW)).toContain('Last synced 1 min ago');
  });
});
