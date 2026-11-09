import { describe, expect, it } from 'vitest';
import type { OwnedEntry } from '../types';
import { exportCollectionCsv, parseCollectionCsv } from './collectionCsv';
import { fixtureCatalog, KEYS } from './testing';

const catalog = fixtureCatalog();
const NOW = 1_700_000_000_000;

const parse = (text: string) => parseCollectionCsv(text, catalog, NOW);
const shape = (entries: OwnedEntry[]) =>
  entries.map(({ printingKey, finish, condition, quantity, notes }) => ({
    printingKey,
    finish,
    condition,
    quantity,
    ...(notes !== undefined ? { notes } : {}),
  }));

describe('parseCollectionCsv: TCGplayer exports', () => {
  const header = 'Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU,Price';

  it('matches by TCGplayer product id first, even when other columns disagree', () => {
    const row = '2,Wrong Name,Wrong Name,Origins,999,OGN,Foil,Lightly Played,English,Common,685593,1,0.5';
    const result = parse(`${header}\r\n${row}\r\n`);
    expect(result.format).toBe('tcgplayer');
    expect(shape(result.entries)).toEqual([
      { printingKey: KEYS.spiritAlt, finish: 'foil', condition: 'LP', quantity: 2 },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.fuzzyMatched).toBe(0);
  });

  it('falls back to set code plus number, using the variant hint in the name', () => {
    const text = [
      'Quantity,Name,Set,Card Number,Set Code,Printing,Condition',
      '1,Bewitching Spirit,Unleashed,121,UNL,Normal,Near Mint',
      '1,Bewitching Spirit (Alternate Art),Unleashed,121,UNL,Normal,Near Mint',
      '1,Bewitching Spirit,Unleashed,121a,UNL,Foil,Near Mint',
    ].join('\n');
    const result = parse(text);
    expect(result.entries.map((e) => [e.printingKey, e.finish])).toEqual([
      [KEYS.spirit, 'normal'],
      [KEYS.spiritAlt, 'normal'],
      [KEYS.spiritAlt, 'foil'],
    ]);
    // Only the first row is a guess: standard and alternate art share set and number.
    expect(result.fuzzyMatched).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ line: 2, severity: 'warning' });
    expect(result.issues[0]!.message).toContain('Several printings share');
  });

  it('understands combined number formats and set names', () => {
    const text = 'Qty,Set,Number\n3,Origins,042/298\n1,,UNL-030\n2,Riftbound Unleashed,29';
    const result = parse(text);
    expect(result.entries.map((e) => [e.printingKey, e.quantity])).toEqual([
      [KEYS.poro, 3],
      [KEYS.vi, 1],
    ]);
    expect(result.issues.map((i) => i.line)).toEqual([4]);
  });

  it('reads "Near Mint Foil" style conditions as condition plus foil', () => {
    const result = parse('Quantity,Name,Condition\n1,Stalwart Poro,Near Mint Foil\n1,Stalwart Poro,Damaged');
    expect(result.entries.map((e) => [e.finish, e.condition])).toEqual([
      ['foil', 'NM'],
      ['normal', 'DMG'],
    ]);
  });

  it('matches exact names within a set, then counts fuzzy names with warnings', () => {
    const text = 'Quantity,Name,Set Code\n1,Stalwart Poro,OGN\n1,Stalwart Porro,OGN\n1,kaisa,OGN';
    const result = parse(text);
    expect(result.entries.map((e) => e.printingKey)).toEqual([KEYS.poro, KEYS.kaisa]);
    expect(result.entries).toHaveLength(2);
    expect(result.fuzzyMatched).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ line: 3, severity: 'warning' });
    expect(result.issues[0]!.message).toContain('Stalwart Poro');
  });

  it('does not match a fuzzy name that is too different', () => {
    const result = parse('Quantity,Name\n1,Completely Unknown Card');
    expect(result.entries).toEqual([]);
    expect(result.issues[0]).toMatchObject({ line: 2, severity: 'error' });
  });

  it('prefers the name when the number contradicts it', () => {
    const result = parse('Quantity,Name,Set Code,Card Number\n1,Stalwart Poro,OGN,100');
    expect(result.entries.map((e) => e.printingKey)).toEqual([KEYS.poro]);
  });

  it('picks the standard printing when a name alone is ambiguous, and flags a guess only when it is one', () => {
    const plain = parse('Quantity,Name\n1,Bewitching Spirit');
    expect(plain.entries[0]!.printingKey).toBe(KEYS.spirit);
    expect(plain.fuzzyMatched).toBe(0);
    const hinted = parse('Quantity,Name\n1,Vi - Piltover Enforcer (Alternate Art)');
    expect(hinted.entries[0]!.printingKey).toBe(KEYS.legend);
    expect(hinted.fuzzyMatched).toBe(1);
  });

  it('sums duplicate rows for the same printing, finish and condition', () => {
    const result = parse('Quantity,Product ID\n1,650042\n2,650042');
    expect(shape(result.entries)).toEqual([{ printingKey: KEYS.poro, finish: 'normal', condition: 'NM', quantity: 3 }]);
  });
});

describe('parseCollectionCsv: robustness', () => {
  it('reports per-row issues with line numbers and keeps going', () => {
    const text = [
      'Quantity,Product ID,Condition,Printing',
      '1,650042,Near Mint,Normal',
      'abc,650042,,',
      '1,000000,,',
      '0,650042,,',
      ',650042,,',
      '1,650100,Weird,Sparkly',
    ].join('\n');
    const result = parse(text);
    expect(result.rowsRead).toBe(6);
    expect(result.entries.map((e) => e.printingKey)).toEqual([KEYS.poro, KEYS.kaisa]);
    const errors = result.issues.filter((i) => i.severity === 'error').map((i) => i.line);
    expect(errors).toEqual([3, 4, 5, 6]);
    const warnings = result.issues.filter((i) => i.severity === 'warning');
    expect(warnings.map((w) => w.line)).toEqual([7, 7]);
    expect(result.issues[0]!.raw).toBe('abc,650042,,');
  });

  it('never throws on garbage and explains missing headers', () => {
    for (const text of ['', '\n\n', 'just some text', '\u0000\u0001,,,\n"unclosed', 'a,b\n1,2']) {
      const result = parse(text);
      expect(result.entries).toEqual([]);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('assumes quantity 1 when the file has no quantity column', () => {
    const result = parse('Name,Set Code\nStalwart Poro,OGN');
    expect(result.entries[0]!.quantity).toBe(1);
    expect(result.issues[0]).toMatchObject({ severity: 'warning', line: 1 });
  });

  it('copes with BOM, quoted commas, embedded newlines and extra columns', () => {
    const text = '\ufeffQuantity,Name,Notes,Extra\r\n1,"Stalwart Poro","line one\nline two, with comma",zzz\r\n';
    const result = parse(text);
    expect(result.entries[0]!.notes).toBe('line one\nline two, with comma');
    expect(result.issues).toEqual([]);
  });

  it('finds a header below leading junk lines', () => {
    const result = parse('Exported by Something\n\nQuantity,Name\n1,Kai\'Sa');
    expect(result.entries.map((e) => e.printingKey)).toEqual([KEYS.kaisa]);
  });

  it('warns about an unterminated quote', () => {
    const result = parse('Quantity,Name\n1,Kai\'Sa\n1,"Stalwart Poro');
    expect(result.issues.some((i) => /never closed/.test(i.message))).toBe(true);
  });

  it('stamps entries with ids and the supplied time', () => {
    const result = parse('Quantity,Name\n1,Stalwart Poro\n1,Kai\'Sa');
    expect(result.entries.every((e) => e.updatedAt === NOW && e.id.length > 0)).toBe(true);
    expect(new Set(result.entries.map((e) => e.id)).size).toBe(2);
  });
});

describe('exportCollectionCsv', () => {
  const owned: OwnedEntry[] = [
    { id: 'a', updatedAt: 1, printingKey: KEYS.spiritAlt, finish: 'foil', condition: 'LP', quantity: 2 },
    { id: 'b', updatedAt: 2, printingKey: KEYS.kaisa, finish: 'normal', condition: 'NM', quantity: 4, notes: 'Trade, "binder"\nsecond line' },
    { id: 'c', updatedAt: 3, printingKey: KEYS.runeMetal, finish: 'normal', condition: 'MP', quantity: 1 },
    { id: 'd', updatedAt: 4, printingKey: KEYS.poro, finish: 'foil', condition: 'DMG', quantity: 9, deleted: true },
  ];

  it('skips tombstones and writes readable columns', () => {
    const csv = exportCollectionCsv(owned, catalog);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Printing Key,Set,Number,Name,Variant,Finish,Condition,Quantity,Notes,TCGplayer Id');
    expect(csv).not.toContain(KEYS.poro);
    expect(csv).toContain("Kai'Sa");
  });

  it('round trips: export then import reproduces the entries', () => {
    const result = parseCollectionCsv(exportCollectionCsv(owned, catalog), catalog, NOW);
    expect(result.issues).toEqual([]);
    expect(result.format).toBe('shinycardboard');
    expect(shape(result.entries)).toEqual(shape(owned.filter((e) => !e.deleted)));
  });

  it('round trips the empty collection', () => {
    const result = parseCollectionCsv(exportCollectionCsv([], catalog), catalog, NOW);
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('reports rows whose printing is not in the catalog instead of losing them silently', () => {
    const ghost: OwnedEntry = { id: 'x', updatedAt: 1, printingKey: 'zzz-001-standard', finish: 'normal', condition: 'NM', quantity: 1 };
    const result = parseCollectionCsv(exportCollectionCsv([ghost], catalog), catalog, NOW);
    expect(result.entries).toEqual([]);
    expect(result.issues[0]).toMatchObject({ severity: 'error', line: 2 });
  });
});
