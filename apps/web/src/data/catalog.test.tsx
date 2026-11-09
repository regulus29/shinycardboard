import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Catalog } from '@sc/core';
import { CatalogGate, CatalogProvider, fetchCatalog, useCatalog } from './catalog';

const CATALOG: Catalog = { builtAt: '2026-01-01', cards: {}, printings: {}, sets: [] };

function Probe() {
  const { state } = useCatalog();
  return <p>{state.status}</p>;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchCatalog', () => {
  const stubFetch = (impl: () => Promise<unknown>) => vi.stubGlobal('fetch', vi.fn(impl));

  it('returns a valid catalog', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => CATALOG }));
    expect(await fetchCatalog('/catalog.json')).toEqual(CATALOG);
  });

  it('rejects bad JSON, wrong shape and HTTP errors with readable messages', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError('x')) }));
    await expect(fetchCatalog('/c')).rejects.toThrow('not valid JSON');
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }));
    await expect(fetchCatalog('/c')).rejects.toThrow('unexpected shape');
    stubFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(fetchCatalog('/c')).rejects.toThrow('503');
  });

  it('propagates network failure (offline)', async () => {
    stubFetch(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(fetchCatalog('/c')).rejects.toThrow('Failed to fetch');
  });
});

describe('CatalogProvider and CatalogGate', () => {
  it('goes loading to ready', async () => {
    render(
      <CatalogProvider load={async () => CATALOG}>
        <Probe />
      </CatalogProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('ready')).toBeInTheDocument();
  });

  it('shows an error state when offline and recovers on retry', async () => {
    let online = false;
    const load = async () => {
      if (!online) throw new Error('Failed to fetch');
      return CATALOG;
    };
    render(
      <CatalogProvider load={load}>
        <CatalogGate>
          <p>content</p>
        </CatalogGate>
      </CatalogProvider>,
    );
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    online = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('content')).toBeInTheDocument();
  });
});
