import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDeck, useOwned, useOwnedForPrinting, useSavedSearches, useTagCounts } from './hooks';
import { addTag, deleteDeck, saveDeck, saveSearch, setOwnedQuantity } from './mutations';
import { resetDb } from '../test/helpers';

describe('live hooks', () => {
  beforeEach(resetDb);

  it('useOwned reacts to writes and hides tombstones', async () => {
    const { result } = renderHook(() => useOwned());
    expect(result.current).toBeUndefined(); // loading, not empty
    await waitFor(() => expect(result.current).toEqual([]));

    await act(() => setOwnedQuantity({ printingKey: 'a-001-standard' }, 2));
    await waitFor(() => expect(result.current).toHaveLength(1));

    await act(() => setOwnedQuantity({ printingKey: 'a-001-standard' }, 0));
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('useOwnedForPrinting filters by printing', async () => {
    await setOwnedQuantity({ printingKey: 'a-001-standard' }, 1);
    await setOwnedQuantity({ printingKey: 'b-002-standard' }, 1);
    const { result } = renderHook(() => useOwnedForPrinting('a-001-standard'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current![0]!.printingKey).toBe('a-001-standard');
  });

  it('useDeck distinguishes loading, found and deleted', async () => {
    const deck = await saveDeck({ name: 'Tempo' });
    const { result } = renderHook(() => useDeck(deck.id));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current?.name).toBe('Tempo'));
    await act(() => deleteDeck(deck.id));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('useTagCounts and useSavedSearches summarize their tables', async () => {
    await addTag('a', 'burn');
    await addTag('b', 'burn');
    await saveSearch({ name: 'Zed', query: 'z' });
    await saveSearch({ name: 'Alpha', query: 'a' });
    const tags = renderHook(() => useTagCounts());
    const searches = renderHook(() => useSavedSearches());
    await waitFor(() => expect(tags.result.current).toEqual([{ tag: 'burn', count: 2 }]));
    await waitFor(() => expect(searches.result.current!.map((s) => s.name)).toEqual(['Alpha', 'Zed']));
  });
});
