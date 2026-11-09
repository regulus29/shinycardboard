import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entry, post, useHarness } from './testkit';
import { STATE_FILE_NAME } from './store';

const { start, dataDir } = useHarness();
const storedState = () => readFile(path.join(dataDir(), STATE_FILE_NAME), 'utf8');
const pushOwned = (base: string, records: ReturnType<typeof entry>[]) =>
  post(base, { since: 0, changes: { owned: records } });
const numbered = (count: number) => Array.from({ length: count }, (_, i) => entry(`r${i}`, 1));

describe('state caps', () => {
  it('rejects a push that grows a collection past the record cap with 413, and stores nothing', async () => {
    const { base } = await start({ maxRecordsPerCollection: 2 });
    expect((await pushOwned(base, [entry('a', 1), entry('b', 1)])).status).toBe(200);
    const before = await storedState();

    const response = await pushOwned(base, [entry('c', 1)]);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'state_limit' });
    expect(await storedState()).toBe(before);
  });

  it('still accepts updates to existing ids when the collection is at the record cap', async () => {
    const { base } = await start({ maxRecordsPerCollection: 2 });
    await pushOwned(base, [entry('a', 1), entry('b', 1)]);
    const response = await pushOwned(base, [entry('a', 2, { quantity: 2 })]);
    expect(response.status).toBe(200);
  });

  it('rejects a push that takes the serialized state past the byte cap, and stores nothing', async () => {
    const { base } = await start({ maxStateBytes: 2048 });
    expect((await pushOwned(base, numbered(1))).status).toBe(200);
    const before = await storedState();

    const response = await pushOwned(base, numbered(30).slice(1));
    expect(response.status).toBe(413);
    expect(await storedState()).toBe(before);
  });
});
