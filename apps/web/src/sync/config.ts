import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '../config/constants';

/**
 * Sync server settings. Stored in localStorage on this device only; the token is never
 * logged, never included in error messages and never written to the synced database.
 */
export interface SyncConfig {
  url: string;
  token: string;
}

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedConfig: SyncConfig | null = null;

/** Trim whitespace and trailing slashes so path joining is predictable. */
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function parse(raw: string | null): SyncConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SyncConfig>;
    const url = normalizeServerUrl(value.url ?? '');
    return url ? { url, token: value.token ?? '' } : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.syncConfig);
  } catch {
    return null;
  }
}

/** Current config, or null when sync is not set up. Reference-stable between changes. */
export function loadSyncConfig(): SyncConfig | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedConfig = parse(raw);
  }
  return cachedConfig;
}

export function saveSyncConfig(config: SyncConfig): void {
  const url = normalizeServerUrl(config.url);
  try {
    if (url) localStorage.setItem(STORAGE_KEYS.syncConfig, JSON.stringify({ url, token: config.token.trim() }));
    else localStorage.removeItem(STORAGE_KEYS.syncConfig);
  } catch {
    /* storage unavailable: sync stays disabled */
  }
  listeners.forEach((listener) => listener());
}

export function clearSyncConfig(): void {
  saveSyncConfig({ url: '', token: '' });
}

export function subscribeSyncConfig(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEYS.syncConfig) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSyncConfig(): SyncConfig | null {
  return useSyncExternalStore(subscribeSyncConfig, loadSyncConfig, () => null);
}
