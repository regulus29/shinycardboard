import { describe, expect, it } from 'vitest';
import type { UserData } from '../types';
import { exportBackup, importBackup } from './backup';

const data: UserData = {
  owned: [
    { id: 'o1', updatedAt: 10, printingKey: 'ogn-042-standard', finish: 'foil', condition: 'LP', quantity: 3, notes: 'x' },
    { id: 'o2', updatedAt: 11, printingKey: 'ogn-043-standard', finish: 'normal', condition: 'NM', quantity: 0, deleted: true },
  ],
  taggings: [{ id: 'stalwart-poro', updatedAt: 5, cardKey: 'stalwart-poro', tags: ['budget'], note: 'n' }],
  decks: [
    {
      id: 'd1',
      updatedAt: 20,
      name: 'Fury',
      legendKey: 'vi-piltover-enforcer',
      main: [{ cardKey: 'vi', count: 1 }, { cardKey: 'fury-bolt', count: 3, printingKey: 'ogn-120-standard' }],
      runes: [{ cardKey: 'fury-rune', count: 12 }],
      battlefields: [],
      sideboard: [],
      tags: ['aggro'],
    },
  ],
  savedSearches: [{ id: 's1', updatedAt: 1, name: 'Mine', query: 'owned:yes' }],
};

describe('backup', () => {
  it('round trips every collection', () => {
    expect(importBackup(exportBackup(data, 123))).toEqual({ data });
  });

  it('writes a versioned envelope', () => {
    const parsed = JSON.parse(exportBackup(data, 123));
    expect(parsed).toMatchObject({ app: 'shinycardboard', version: 1, exportedAt: 123 });
  });

  it('tolerates and preserves unknown extra fields', () => {
    const parsed = JSON.parse(exportBackup(data));
    parsed.futureTopLevel = true;
    parsed.data.owned[0].extra = 'keep me';
    parsed.data.decks[0].main[0].extra = 1;
    const result = importBackup(JSON.stringify(parsed));
    expect(result).toHaveProperty('data');
    expect((result as { data: UserData }).data.owned[0]).toHaveProperty('extra', 'keep me');
  });

  const mutate = (change: (parsed: any) => void): string => { // eslint-disable-line @typescript-eslint/no-explicit-any -- test-only edit of untyped JSON
    const parsed = JSON.parse(exportBackup(data));
    change(parsed);
    return JSON.stringify(parsed);
  };
  const errorOf = (json: string): string => {
    const result = importBackup(json);
    if (!('error' in result)) throw new Error('expected an error');
    return result.error;
  };

  it('rejects non JSON and foreign files with clear messages', () => {
    expect(errorOf('not json')).toMatch(/not valid JSON/);
    expect(errorOf('[1,2]')).toMatch(/Not a Shiny Cardboard backup/);
    expect(errorOf('{"app":"other","version":1,"data":{}}')).toMatch(/Not a Shiny Cardboard backup/);
  });

  it('rejects newer and malformed versions', () => {
    expect(errorOf(mutate((p) => (p.version = 2)))).toMatch(/version 2.*Update the app/);
    expect(errorOf(mutate((p) => (p.version = 'one')))).toMatch(/version must be/);
    expect(errorOf(mutate((p) => delete p.version))).toMatch(/version must be/);
  });

  it('rejects missing collections', () => {
    expect(errorOf(mutate((p) => delete p.data.decks))).toMatch(/data\.decks must be a list/);
    expect(errorOf(mutate((p) => (p.data = null)))).toMatch(/data must be an object/);
  });

  it('validates every record shape and names the field', () => {
    expect(errorOf(mutate((p) => (p.data.owned[0].finish = 'shiny')))).toMatch(/owned\[0\]\.finish/);
    expect(errorOf(mutate((p) => (p.data.owned[1].condition = 'XX')))).toMatch(/owned\[1\]\.condition/);
    expect(errorOf(mutate((p) => (p.data.owned[0].quantity = -1)))).toMatch(/owned\[0\]\.quantity/);
    expect(errorOf(mutate((p) => (p.data.owned[0].quantity = 1.5)))).toMatch(/quantity/);
    expect(errorOf(mutate((p) => (p.data.owned[0].updatedAt = 'now')))).toMatch(/owned\[0\]\.updatedAt/);
    expect(errorOf(mutate((p) => delete p.data.owned[0].id))).toMatch(/owned\[0\]\.id/);
    expect(errorOf(mutate((p) => (p.data.taggings[0].tags = 'x')))).toMatch(/taggings\[0\]\.tags/);
    expect(errorOf(mutate((p) => (p.data.decks[0].main[1].count = 0)))).toMatch(/decks\[0\]\.main\[1\]\.count/);
    expect(errorOf(mutate((p) => (p.data.decks[0].runes = {})))).toMatch(/decks\[0\]\.runes must be a list/);
    expect(errorOf(mutate((p) => (p.data.savedSearches[0].query = 5)))).toMatch(/savedSearches\[0\]\.query/);
    expect(errorOf(mutate((p) => (p.data.owned[0].deleted = 'yes')))).toMatch(/deleted/);
  });

  it('rejects duplicate ids and summarizes many problems', () => {
    expect(errorOf(mutate((p) => (p.data.owned[1].id = 'o1')))).toMatch(/used twice/);
    const many = errorOf(mutate((p) => p.data.owned.push(...Array.from({ length: 6 }, () => ({ id: '' })))));
    expect(many).toMatch(/and \d+ more/);
  });
});
