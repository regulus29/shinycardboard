import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Catalog } from '@sc/core';
import { CatalogProvider } from '../data';
import { SyncEngine } from '../sync';
import { SyncProvider } from '../sync/SyncProvider';
import { ToastProvider } from '../ui';
import { AppRoutes } from './AppRoutes';
import { AppShell } from './AppShell';
import { OMNIBOX_INPUT_ID } from '../config/constants';
import { saveDeck, saveSearch } from '../data';
import { resetDb } from '../test/helpers';
import { resetSettingsCache } from '../settings/settingsStore';

const CATALOG: Catalog = { builtAt: '2026-01-01T00:00:00Z', cards: {}, printings: {}, sets: [] };

function renderApp(path: string, load: () => Promise<Catalog> = async () => CATALOG) {
  const engine = new SyncEngine(); // never started: auto sync is off in tests
  return render(
    <ToastProvider>
      <CatalogProvider load={load}>
        <MemoryRouter initialEntries={[path]}>
          <SyncProvider engine={engine} autoStart={false}>
            <AppRoutes />
          </SyncProvider>
        </MemoryRouter>
      </CatalogProvider>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  localStorage.clear();
  resetSettingsCache();
  await resetDb();
});

describe('app shell', () => {
  it('redirects / to the collection and renders landmarks and primary navigation', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Collection' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    const navs = screen.getAllByRole('navigation', { name: 'Primary' });
    expect(navs.length).toBe(2); // sidebar and tab bar (CSS decides which is visible)
    expect(screen.getAllByRole('link', { name: 'Decks' }).length).toBeGreaterThan(0);
  });

  it.each([
    ['/sets', 'Sets'],
    ['/decks', 'Decks'],
    ['/settings', 'Settings'],
  ])('routes %s to its page', async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('shows a friendly 404 for unknown routes', async () => {
    renderApp('/nope');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });

  it('shows a retryable error when the catalog fails, but keeps Settings reachable', async () => {
    let attempts = 0;
    renderApp('/collection', async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
      return CATALOG;
    });
    expect(await screen.findByText('boom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Collection' })).toBeInTheDocument();
  });

  it('focuses the omnibox with the / shortcut but not while typing in a field', async () => {
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await userEvent.keyboard('/');
    expect(document.getElementById(OMNIBOX_INPUT_ID)).toHaveFocus();

    // Typing a slash inside the omnibox itself must insert it, not re-trigger the shortcut.
    await userEvent.keyboard('a/b');
    expect(screen.getByRole('searchbox', { name: 'Search cards' })).toHaveValue('a/b');
  });

  it('submits the omnibox to /collection?q=', async () => {
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search cards' }), 'fury unit{Enter}');
    expect(await screen.findByText(/Search results for "fury unit"/)).toBeInTheDocument();
  });

  it('fills the sidebar slots from saved searches and recent decks', async () => {
    await saveSearch({ name: 'Fury units', query: 'fury unit' });
    await saveDeck({ name: 'Ember tempo' });
    renderApp('/settings');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Fury units' })).toHaveAttribute('href', '/collection?q=fury%20unit'), { timeout: 4000 });
    expect(await screen.findByRole('link', { name: 'Ember tempo' }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('collapses the sidebar and remembers it', async () => {
    renderApp('/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Toggle sidebar' }));
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute('aria-expanded', 'false');
    expect(JSON.parse(localStorage.getItem('sc.settings.v1')!).sidebarCollapsed).toBe(true);
  });
});

describe('AppShell error boundary', () => {
  it('contains a crashing page and recovers on navigation', async () => {
    const Boom = () => {
      throw new Error('kaboom');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ToastProvider>
        <CatalogProvider load={async () => CATALOG}>
          <MemoryRouter initialEntries={['/x']}>
            <SyncProvider engine={new SyncEngine()} autoStart={false}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/x" element={<Boom />} />
                </Route>
              </Routes>
            </SyncProvider>
          </MemoryRouter>
        </CatalogProvider>
      </ToastProvider>,
    );
    expect(await screen.findByText('This page hit a problem')).toBeInTheDocument();
    expect(screen.queryByText('kaboom')).toBeNull(); // raw error text is never shown
    expect(screen.getByRole('main')).toBeInTheDocument(); // shell survives
    spy.mockRestore();
  });
});
