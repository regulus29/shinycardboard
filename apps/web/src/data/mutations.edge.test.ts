import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { describeStorageError, subscribeLocalChanges, subscribeStorageFailures } from './changeBus';
import { nextUpdatedAt } from './repo';
import { addTag, deleteDeck, removeTag, renameTag, saveDeck, setOwnedQuantity } from './mutations';
import { installFakeClock, resetDb } from '../test/helpers';

const KEY = { printingKey: 'ogn-001-standard' };

describe('mutation edge cases', () => {
  let clock: ReturnType<typeof installFakeClock>;
  beforeEach(async () => {
    await resetDb();
    clock = installFakeClock();
  });
  afterEach(() => clock.restore());

  it('NaN and Infinity never delete a card', async () => {
    await setOwnedQuantity(KEY, 3);
    expect((await setOwnedQuantity(KEY, Number.NaN))?.quantity).toBe(3);
    expect((await setOwnedQuantity(KEY, Number.POSITIVE_INFINITY))?.quantity).toBe(3);
    expect((await db.owned.toArray())[0]?.deleted).toBeUndefined();
  });

  it('a stepped-back clock cannot make an edit older than its previous version', async () => {
    const first = await setOwnedQuantity(KEY, 1);
    clock.set(clock.now - 60_000);
    const second = await setOwnedQuantity(KEY, 2);
    expect(second!.updatedAt).toBeGreaterThan(first!.updatedAt);
    expect(nextUpdatedAt(10, 50)).toBe(51);
  });

  it('reviving a deleted owned row starts without the old notes', async () => {
    await setOwnedQuantity(KEY, 2, 'signed by artist');
    await setOwnedQuantity(KEY, 0);
    const revived = await setOwnedQuantity(KEY, 1);
    expect(revived?.notes).toBeUndefined();
  });

  it('does not announce a change when nothing was written', async () => {
    const listener = vi.fn();
    const off = subscribeLocalChanges(listener);
    await setOwnedQuantity(KEY, 0); // nothing to remove
    await removeTag('nobody', 'nothing');
    await deleteDeck('missing');
    expect(listener).not.toHaveBeenCalled();
    await setOwnedQuantity(KEY, 1);
    off();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('saveDeck keeps stored data for undefined fields and trims or defaults the name', async () => {
    const deck = await saveDeck({ name: 'Base', notes: 'keep me' });
    const updated = await saveDeck({ id: deck.id, name: '  Renamed  ', notes: undefined });
    expect(updated).toMatchObject({ name: 'Renamed', notes: 'keep me' });
    const blank = await saveDeck({ id: deck.id, name: '   ' });
    expect(blank.name).toBe('Renamed');
    expect((await saveDeck({ name: '   ' })).name).toBe('Untitled deck');
  });

  it('saving over a deleted deck needs an explicit revive', async () => {
    const deck = await saveDeck({ name: 'Gone' });
    await deleteDeck(deck.id);
    await expect(saveDeck({ id: deck.id, name: 'Back' })).rejects.toThrow(/deleted/);
    const revived = await saveDeck({ id: deck.id, name: 'Back' }, { revive: true });
    expect(revived.deleted).toBeUndefined();
  });

  it('renameTag normalizes the source name', async () => {
    await addTag('a', 'old tag');
    expect(await renameTag('  OLD   tag ', 'new')).toBe(1);
  });

  it('reports write failures to subscribers and rethrows', async () => {
    const failures: string[] = [];
    const off = subscribeStorageFailures((f) => failures.push(f.title));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const spy = vi.spyOn(db.owned, 'put').mockRejectedValue(quota);
    await expect(setOwnedQuantity(KEY, 1)).rejects.toBeTruthy();
    spy.mockRestore();
    off();
    expect(failures).toEqual(['Storage is full']);
    expect(describeStorageError(new Error('other')).title).toBe('Could not save your change');
  });
});
