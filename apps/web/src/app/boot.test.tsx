import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Catalog } from '@sc/core';
import { Dialog, ToastProvider } from '../ui';
import { db } from '../data/db';
import { CatalogGate, CatalogProvider } from '../data';
import { SyncEngine } from '../sync';
import { SyncProvider } from '../sync/SyncProvider';
import { AppRoutes } from './AppRoutes';
import { CardAliasRedirect } from './CardAliasRedirect';
import { ErrorBoundary } from './ErrorBoundary';
import { StorageGate } from './StorageGate';
import { UpdatePrompt } from './UpdatePrompt';
import { pwaState } from '../test/pwa-register-stub';
import { OMNIBOX_INPUT_ID } from '../config/constants';

const EMPTY: Catalog = { builtAt: '', cards: {}, printings: {}, sets: [] };

afterEach(() => {
  vi.restoreAllMocks();
  pwaState.needRefresh = false;
  pwaState.offlineReady = false;
});

describe('StorageGate', () => {
  it('opens the database and renders the app', async () => {
    render(
      <StorageGate>
        <p>app</p>
      </StorageGate>,
    );
    expect(await screen.findByText('app')).toBeInTheDocument();
  });

  it('explains an unavailable database and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const open = vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('SecurityError: denied'));
    render(
      <StorageGate>
        <p>app</p>
      </StorageGate>,
    );
    expect(await screen.findByRole('heading', { name: 'Storage unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/private or incognito/)).toBeInTheDocument();
    expect(screen.queryByText(/denied/)).toBeNull();
    open.mockResolvedValue(db);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('app')).toBeInTheDocument();
  });
});

describe('root ErrorBoundary', () => {
  it('shows a reload screen without leaking the raw error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Boom = () => {
      throw new Error('secret internals');
    };
    render(
      <ErrorBoundary scope="app">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Shiny Cardboard hit a problem')).toBeInTheDocument();
    expect(screen.queryByText(/secret internals/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

describe('UpdatePrompt', () => {
  it('offers a Reload action when an update is ready', () => {
    pwaState.needRefresh = true;
    pwaState.update = vi.fn(() => Promise.resolve());
    render(
      <ToastProvider>
        <UpdatePrompt />
      </ToastProvider>,
    );
    expect(screen.getByText('Update available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(pwaState.update).toHaveBeenCalled();
  });

  it('announces offline readiness', () => {
    pwaState.offlineReady = true;
    render(
      <ToastProvider>
        <UpdatePrompt />
      </ToastProvider>,
    );
    expect(screen.getByText('Ready to work offline')).toBeInTheDocument();
  });
});

describe('/ shortcut and modals', () => {
  it('does not steal focus while a dialog is open, and the app root is inert', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    const { unmount } = render(
      <ToastProvider>
        <CatalogProvider load={async () => EMPTY}>
          <MemoryRouter initialEntries={['/settings']}>
            <SyncProvider engine={new SyncEngine()} autoStart={false}>
              <AppRoutes />
              <Dialog open onClose={() => undefined} title="Modal">
                <button>Inside</button>
              </Dialog>
            </SyncProvider>
          </MemoryRouter>
        </CatalogProvider>
      </ToastProvider>,
      { container: root.appendChild(document.createElement('div')) },
    );
    expect(root).toHaveAttribute('inert');
    await act(async () => {
      fireEvent.keyDown(document.body, { key: '/' });
    });
    expect(document.getElementById(OMNIBOX_INPUT_ID)).not.toHaveFocus();
    unmount();
    expect(root).not.toHaveAttribute('inert');
    root.remove();
  });
});

describe('CardAliasRedirect', () => {
  function Where() {
    return <p>at {useLocation().pathname}</p>;
  }
  const catalog = {
    ...EMPTY,
    printings: { 'unl-029-219-standard': {} as never },
    keyAliases: { 'unl-029-standard': 'unl-029-219-standard' },
  } as Catalog;

  const renderAt = (path: string) =>
    render(
      <CatalogProvider load={async () => catalog}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/card/:printingKey"
              element={
                <CatalogGate>
                  <CardAliasRedirect>
                    <Where />
                  </CardAliasRedirect>
                </CatalogGate>
              }
            />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    );

  it('redirects a retired printing key route to the current key', async () => {
    renderAt('/card/unl-029-standard');
    expect(await screen.findByText('at /card/unl-029-219-standard')).toBeInTheDocument();
  });

  it('leaves current and unknown keys alone', async () => {
    renderAt('/card/mystery-1-standard');
    expect(await screen.findByText('at /card/mystery-1-standard')).toBeInTheDocument();
  });
});
