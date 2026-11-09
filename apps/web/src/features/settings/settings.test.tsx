import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { exportBackup, type Catalog } from '@sc/core';
import { CatalogProvider } from '../../data';
import { setOwnedQuantity } from '../../data/mutations';
import { SyncEngine, clearSyncConfig, loadSyncConfig } from '../../sync';
import { SyncProvider } from '../../sync/SyncProvider';
import { ToastProvider } from '../../ui';
import { resetDb } from '../../test/helpers';
import { resetSettingsCache } from '../../settings/settingsStore';
import { STORAGE_KEYS } from '../../config/constants';
import SettingsPage from './SettingsPage';
import { isInsecureRemoteUrl } from './SyncSection';

const CATALOG: Catalog = { builtAt: '2026-01-01T00:00:00Z', cards: {}, printings: {}, sets: [] };

function renderSettings() {
  return render(
    <ToastProvider>
      <CatalogProvider load={async () => CATALOG}>
        <MemoryRouter>
          <SyncProvider engine={new SyncEngine()} autoStart={false}>
            <SettingsPage />
          </SyncProvider>
        </MemoryRouter>
      </CatalogProvider>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  clearSyncConfig();
  resetSettingsCache();
  await resetDb();
});
afterEach(() => vi.restoreAllMocks());

describe('SettingsPage', () => {
  it('renders every section', async () => {
    renderSettings();
    for (const name of ['Appearance', 'Sync', 'Your data', 'Storage', 'About']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Sync is off\. Add a server below/)).toBeInTheDocument();
  });

  it('changes theme and persists it', async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole('radio', { name: 'Light' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings)!).theme).toBe('light');
  });

  it('validates the sync URL, warns about plain http, and saves the config', async () => {
    renderSettings();
    const url = await screen.findByLabelText('Server URL');
    await userEvent.type(url, 'not a url');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/Enter a full address/)).toBeInTheDocument();

    await userEvent.clear(url);
    await userEvent.type(url, 'http://sync.example.com');
    expect(screen.getByRole('note')).toHaveTextContent(/unencrypted/);
    await userEvent.type(screen.getByLabelText('Access token'), 'tok');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(loadSyncConfig()).toEqual({ url: 'http://sync.example.com', token: 'tok' });
    expect(screen.getByText(/plain text/)).toBeInTheDocument();
  });

  it('does not warn for localhost or https', () => {
    expect(isInsecureRemoteUrl('http://localhost:8787')).toBe(false);
    expect(isInsecureRemoteUrl('http://127.0.0.1:8787')).toBe(false);
    expect(isInsecureRemoteUrl('https://sync.example.com')).toBe(false);
    expect(isInsecureRemoteUrl('http://192.168.1.5')).toBe(true);
  });

  it('disables resync and sync now until a server is configured', async () => {
    renderSettings();
    expect(await screen.findByRole('button', { name: 'Resync' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });
});

describe('DataSection', () => {
  it('exports a backup and shows a toast', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    renderSettings();
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 1);
    await userEvent.click(await screen.findByRole('button', { name: 'Export backup' }));
    await waitFor(() => expect(screen.getByText('Backup downloaded')).toBeInTheDocument());
    expect(create).toHaveBeenCalled();
  });

  it('rejects a bad backup file with a readable toast', async () => {
    renderSettings();
    const input = (await screen.findByRole('button', { name: 'Import backup' })).parentElement!.querySelector('input[type=file]')!;
    await userEvent.upload(input as HTMLInputElement, new File(['not json'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText('Could not read that backup')).toBeInTheDocument();
  });

  it('confirms before replacing data and then restores', async () => {
    renderSettings();
    const json = exportBackup({
      owned: [{ id: 'z|normal|NM', printingKey: 'z', finish: 'normal', condition: 'NM', quantity: 7, updatedAt: 1 }],
      taggings: [],
      decks: [],
      savedSearches: [],
    });
    const input = (await screen.findByRole('button', { name: 'Import backup' })).parentElement!.querySelector('input[type=file]')!;
    await userEvent.upload(input as HTMLInputElement, new File([json], 'ok.json', { type: 'application/json' }));
    expect(await screen.findByRole('dialog', { name: 'Replace your data?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace data' }));
    expect(await screen.findByText('Backup restored')).toBeInTheDocument();
  });
});

describe('StorageSection', () => {
  it('shows usage and clears the card art cache', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { estimate: async () => ({ usage: 2048, quota: 10_485_760 }), persisted: async () => false, persist: async () => true },
    });
    const del = vi.fn(async () => true);
    vi.stubGlobal('caches', { delete: del });
    renderSettings();
    expect(await screen.findByText(/2\.0 KB used of 10\.0 MB/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear card art' }));
    expect(del).toHaveBeenCalledWith('card-art');
    await userEvent.click(await screen.findByRole('button', { name: 'Request protection' }));
    expect(await screen.findByText('Storage protected')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
