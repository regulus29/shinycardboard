import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { ToastProvider } from '../ui';
import { db } from '../data/db';
import { clearDbFailure, reportDbFailure, useDbFailure } from '../data/health';
import { useOwned } from '../data/hooks';
import { setOwnedQuantity } from '../data/mutations';
import { DATA_MARKER_KEY } from '../config/constants';
import { resetDb } from '../test/helpers';
import { StorageGate } from './StorageGate';
import { DataLossNotice } from './DataLossNotice';

beforeEach(resetDb);
afterEach(() => {
  clearDbFailure();
  vi.restoreAllMocks();
});

describe('mid-session database failure', () => {
  it('swaps in the Storage unavailable screen when a read fails, and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <StorageGate>
        <p>app</p>
      </StorageGate>,
    );
    expect(await screen.findByText('app')).toBeInTheDocument();
    act(() => reportDbFailure('read'));
    expect(await screen.findByRole('heading', { name: 'Storage unavailable' })).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Try again' }).click());
    expect(await screen.findByText('app')).toBeInTheDocument();
  });

  it('a failing live query reports the failure instead of staying silently loading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(db.owned, 'toArray').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => ({ owned: useOwned(), failure: useDbFailure() }));
    expect(result.current.owned).toBeUndefined();
    await vi.waitFor(() => expect(result.current.failure).toBe('read'));
    expect(result.current.owned).toBeUndefined();
  });
});

describe('DataLossNotice', () => {
  const renderNotice = () =>
    render(
      <ToastProvider>
        <DataLossNotice />
      </ToastProvider>,
    );

  it('stays quiet for a fresh install', async () => {
    renderNotice();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Your collection is empty')).toBeNull();
  });

  it('warns when data existed before and the tables are now empty', async () => {
    await db.syncMeta.put({ key: DATA_MARKER_KEY, value: true });
    renderNotice();
    expect(await screen.findByText('Your collection is empty')).toBeInTheDocument();
  });

  it('does not warn while data is present, and writes mark the database', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 1);
    await vi.waitFor(async () => expect((await db.syncMeta.get(DATA_MARKER_KEY))?.value).toBe(true));
    renderNotice();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Your collection is empty')).toBeNull();
  });
});
