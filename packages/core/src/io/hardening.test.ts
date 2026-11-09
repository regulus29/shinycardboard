import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../catalog/build';
import type { Catalog, Deck, OwnedEntry, RiftcodexCard, UserData } from '../types';
import { exportBackup, importBackup } from './backup';
import { exportCollectionCsv, parseCollectionCsv } from './collectionCsv';
import { IO_CONFIG } from './config';
import { sniffDelimiter } from './csv';
import { formatDeckText, parseDeckText } from './deckText';
import { editDistance, splitParentheticals } from './text';
import { KEYS, fixtureCatalog, largeCatalog } from './testing';

const NOW = 1_700_000_000_000;
const fixture = fixtureCatalog();
const parse = (text: string, catalog: Catalog = fixture) => parseCollectionCsv(text, catalog, NOW);

const RAW_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../data/raw/cards.json');
const realCatalog: Catalog | null = existsSync(RAW_PATH)
  ? buildCatalog(JSON.parse(readFileSync(RAW_PATH, 'utf8')) as RiftcodexCard[], 'test')
  : null;

const emptyDeck = (extra: Partial<Deck> = {}): Deck => ({
  id: 'd',
  updatedAt: 1,
  name: 'T',
  main: [],
  runes: [],
  battlefields: [],
  sideboard: [],
  ...extra,
});

/** Deck holding every card of one catalog partition, placed where its type belongs. */
function deckOfCards(catalog: Catalog, keep: (type: string) => boolean): Deck {
  const deck = emptyDeck();
  for (const card of Object.values(catalog.cards)) {
    if (!keep(card.type)) continue;
    const slot = { cardKey: card.cardKey, count: 1 };
    if (card.type === 'Rune') deck.runes.push(slot);
    else if (card.type === 'Battlefield') deck.battlefields.push(slot);
    else deck.main.push(slot);
  }
  return deck;
}

function expectDeckRoundTrips(catalog: Catalog, deck: Deck): void {
  for (const eol of ['\n', '\r\n']) {
    const text = formatDeckText(deck, catalog).replace(/\n/g, eol);
    const { deck: parsed, unmatched } = parseDeckText(text, catalog, NOW);
    expect(unmatched).toEqual([]);
    expect(parsed.main).toEqual(deck.main);
    expect(parsed.runes).toEqual(deck.runes);
    expect(parsed.battlefields).toEqual(deck.battlefields);
    expect(parsed.legendKey).toBe(deck.legendKey);
  }
}

describe('deck text: card names containing //', () => {
  it('parses "Gold // Buff" as a card, with and without a quantity', () => {
    const { deck, unmatched } = parseDeckText('3 Gold // Buff\nGold // Buff\n', fixture, NOW);
    expect(unmatched).toEqual([]);
    expect(deck.main).toEqual([{ cardKey: 'gold-buff', count: 4 }]);
  });

  it('still strips a trailing comment when the whole line is not a card', () => {
    const { deck, unmatched } = parseDeckText('2 Stalwart Poro // my favourite', fixture, NOW);
    expect(unmatched).toEqual([]);
    expect(deck.main).toEqual([{ cardKey: 'stalwart-poro', count: 2 }]);
  });

  it('round trips every fixture card, in LF and CRLF', () => {
    for (const card of Object.values(fixture.cards)) {
      const deck = card.type === 'Legend' ? emptyDeck({ legendKey: card.cardKey }) : deckOfCards(fixture, (t) => t === card.type);
      expectDeckRoundTrips(fixture, deck);
    }
  });

  it.skipIf(!realCatalog)('round trips every card of the real catalog, in LF and CRLF, with nothing unmatched', () => {
    const catalog = realCatalog!;
    expectDeckRoundTrips(catalog, deckOfCards(catalog, (type) => type !== 'Legend'));
    const legends = Object.values(catalog.cards).filter((card) => card.type === 'Legend');
    expect(legends.length).toBeGreaterThan(0);
    for (const legend of legends) expectDeckRoundTrips(catalog, emptyDeck({ legendKey: legend.cardKey }));
  });
});

describe('deck text: sections', () => {
  it('treats Champion as the chosen champion unit, kept in the main deck', () => {
    const text = 'Legend\n1 Vi - Piltover Enforcer\n\nChampion\n1 Vi\n\nMain Deck\n3 Stalwart Poro\n';
    const { deck, unmatched } = parseDeckText(text, fixture, NOW);
    expect(unmatched).toEqual([]);
    expect(deck.legendKey).toBe('vi-piltover-enforcer');
    expect(deck.chosenChampionKey).toBe('vi');
    expect(deck.main).toEqual([{ cardKey: 'stalwart-poro', count: 3 }, { cardKey: 'vi', count: 1 }]);
  });

  it('does not duplicate a champion that is also listed in the main deck, and round trips', () => {
    const deck = emptyDeck({
      legendKey: 'vi-piltover-enforcer',
      chosenChampionKey: 'vi',
      main: [{ cardKey: 'vi', count: 1 }, { cardKey: 'stalwart-poro', count: 3 }],
    });
    const text = formatDeckText(deck, fixture);
    expect(text).toContain('Champion\n1 Vi\n');
    const { deck: parsed, unmatched } = parseDeckText(text, fixture, NOW);
    expect(unmatched).toEqual([]);
    expect(parsed.main).toEqual(deck.main);
    expect(parsed.chosenChampionKey).toBe('vi');
  });

  it('reports cards of the wrong type in the Legend and Champion sections', () => {
    const text = 'Legend\n1 Stalwart Poro\n1 Vi\nChampion\n1 Fury Bolt\n1 Stalwart Poro\n';
    const { deck, unmatched } = parseDeckText(text, fixture, NOW);
    expect(unmatched).toEqual([
      'Stalwart Poro (not a Legend)',
      'Vi (not a Legend)',
      'Fury Bolt (not a Champion unit)',
      'Stalwart Poro (not a Champion unit)',
    ]);
    expect(deck.legendKey).toBeUndefined();
    expect(deck.chosenChampionKey).toBeUndefined();
  });

  it('prefers the Legend when a section asks for one by a shared name prefix', () => {
    const { deck } = parseDeckText('Legend\nVi - Piltover Enforcer\n', fixture, NOW);
    expect(deck.legendKey).toBe('vi-piltover-enforcer');
  });
});

describe('deck text: chosen champion on the real catalog', () => {
  it.skipIf(!realCatalog)('round trips every real Champion unit as the chosen champion', () => {
    const catalog = realCatalog!;
    const champions = Object.values(catalog.cards).filter((c) => c.type === 'Unit' && c.supertype === 'Champion');
    expect(champions.length).toBeGreaterThan(0);
    for (const champion of champions) {
      const deck = emptyDeck({ chosenChampionKey: champion.cardKey, main: [{ cardKey: champion.cardKey, count: 1 }] });
      const { deck: parsed, unmatched } = parseDeckText(formatDeckText(deck, catalog), catalog, NOW);
      expect(unmatched).toEqual([]);
      expect(parsed.chosenChampionKey).toBe(champion.cardKey);
      expect(parsed.main).toEqual(deck.main);
    }
  });
});

describe('deck text: counts and limits', () => {
  it('reports zero, negative and oversized quantities instead of dropping them silently', () => {
    const { deck, unmatched } = parseDeckText('0 Stalwart Poro\n-2 Fury Bolt\n500 Kai\'Sa\n2 Vi', fixture, NOW);
    expect(unmatched).toEqual([
      'Stalwart Poro (quantity 0)',
      '-2 Fury Bolt (negative quantity)',
      "Kai'Sa (quantity 500 is over 99)",
    ]);
    expect(deck.main).toEqual([{ cardKey: 'vi', count: 2 }]);
  });

  it('refuses totals over the cap when the same card is listed repeatedly', () => {
    const text = Array.from({ length: 4 }, () => '30 Stalwart Poro').join('\n');
    const { deck, unmatched } = parseDeckText(text, fixture, NOW);
    expect(deck.main).toEqual([{ cardKey: 'stalwart-poro', count: 90 }]);
    expect(unmatched).toEqual(['Stalwart Poro (total 120 is over 99)']);
  });

  it('reports overlong lines and ignores lines past the limit', () => {
    const long = `1 ${'x'.repeat(IO_CONFIG.maxDeckLineChars + 10)}`;
    const many = Array.from({ length: IO_CONFIG.maxDeckLines + 5 }, () => '1 Vi').join('\n');
    expect(parseDeckText(long, fixture, NOW).unmatched[0]).toMatch(/line longer than/);
    expect(parseDeckText(many, fixture, NOW).unmatched[0]).toMatch(/lines past the/);
  });
});

describe('collection csv: formats and escaping', () => {
  it('reads the newer TCGplayer layout, falling back from a blank Total Quantity to Add to Quantity', () => {
    const text = [
      'Product Name,Set Name,Number,Rarity,Condition,Printing,Add to Quantity,Total Quantity',
      'Stalwart Poro,Origins,042,Common,Near Mint,Normal,2,',
      'Kai\'Sa,Origins,100,Rare,Lightly Played,Foil,1,5',
    ].join('\r\n');
    const result = parse(text);
    expect(result.format).toBe('tcgplayer');
    expect(result.issues).toEqual([]);
    expect(result.entries.map((e) => [e.printingKey, e.finish, e.condition, e.quantity])).toEqual([
      [KEYS.poro, 'normal', 'NM', 2],
      [KEYS.kaisa, 'foil', 'LP', 5],
    ]);
  });

  it('sniffs semicolon and tab delimited files', () => {
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(sniffDelimiter('a\tb\tc')).toBe('\t');
    expect(sniffDelimiter('"a;b",c,d\n')).toBe(',');
    expect(sniffDelimiter('')).toBe(',');
    expect(parse('Quantity;Name\n2;Stalwart Poro').entries[0]).toMatchObject({ quantity: 2, printingKey: KEYS.poro });
    expect(parse('Quantity\tName\n3\tKai\'Sa').entries[0]).toMatchObject({ quantity: 3 });
  });

  it('names the delimiter it used when no header is found', () => {
    expect(parse('foo;bar\n1;2').issues[0]!.message).toMatch(/semicolon/);
  });

  it('gives precise messages for bad quantities', () => {
    const result = parse('Quantity,Name\n-1,Kai\'Sa\n1e3,Kai\'Sa\n1.5,Kai\'Sa\nlots,Kai\'Sa\n0,Kai\'Sa');
    expect(result.issues.map((i) => i.message)).toEqual([
      expect.stringContaining('negative'),
      expect.stringContaining('scientific notation'),
      expect.stringContaining('not a whole number'),
      expect.stringContaining('not a number'),
      expect.stringContaining('at least 1'),
    ]);
  });

  it('guards free text against spreadsheet formulas and restores it on import', () => {
    const notes = ['=SUM(A1)', '+1', '-2', '@x', "'=already quoted", '\tTabbed', "'plain apostrophe", 'ok', '=1,"quoted"\nline'];
    const owned: OwnedEntry[] = notes.map((note, i) => ({
      id: String(i),
      updatedAt: 1,
      printingKey: KEYS.poro,
      finish: 'normal',
      condition: (['NM', 'LP', 'MP', 'HP', 'DMG'] as const)[i % 5]!,
      quantity: i + 1,
      notes: note,
    }));
    // Distinct finish/condition combos so each note survives as its own row.
    owned.forEach((entry, i) => (entry.finish = i < 5 ? 'normal' : 'foil'));
    const csv = exportCollectionCsv(owned, fixture);
    expect(csv).not.toMatch(/(^|,)"?[=+@]/m);
    const result = parse(csv);
    expect(result.issues).toEqual([]);
    expect(result.entries.map((e) => e.notes)).toEqual(notes);
  });

  it('rejects over long identifier fields and truncates long notes with a warning', () => {
    const longName = 'x'.repeat(IO_CONFIG.maxFieldChars + 1);
    const longNote = 'n'.repeat(IO_CONFIG.maxNotesChars + 50);
    const result = parse(`Quantity,Name,Notes\n1,${longName},\n1,Kai'Sa,${longNote}`);
    expect(result.issues[0]).toMatchObject({ severity: 'error', line: 2 });
    expect(result.issues[0]!.message).toMatch(/longer than/);
    expect(result.entries[0]!.notes).toHaveLength(IO_CONFIG.maxNotesChars);
    expect(result.issues[1]).toMatchObject({ severity: 'warning' });
  });

  it('caps the number of rows read and says how many were ignored', () => {
    const rows = Array.from({ length: IO_CONFIG.maxRows + 3 }, () => "1,Kai'Sa").join('\n');
    const result = parse(`Quantity,Name\n${rows}`);
    expect(result.rowsRead).toBe(IO_CONFIG.maxRows);
    expect(result.issues.at(-1)!.message).toContain('3 further rows were ignored');
    expect(result.entries[0]!.quantity).toBe(IO_CONFIG.maxRows);
  });
});

describe('performance on hostile input', () => {
  const LIMIT_MS = 4000;
  const timed = <T>(fn: () => T): [T, number] => {
    const start = performance.now();
    const value = fn();
    return [value, performance.now() - start];
  };

  it('handles thousands of unknown names against a large catalog', () => {
    const catalog = largeCatalog(1000);
    const rows = Array.from({ length: 2000 }, (_, i) => `1,Completely Unknown Card Number ${i}`).join('\n');
    const [result, ms] = timed(() => parse(`Quantity,Name\n${rows}`, catalog));
    expect(result.issues).toHaveLength(2000);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('still fuzzy matches typos in a large catalog', () => {
    const catalog = largeCatalog(1000);
    const name = catalog.cards['big-500']!.name;
    const result = parse(`Quantity,Name\n1,q${name.slice(1)}`, catalog);
    expect(result.entries[0]!.printingKey).toBe('big-0500-standard');
    expect(result.fuzzyMatched).toBe(1);
  });

  it('rejects a 100k character name quickly', () => {
    const [result, ms] = timed(() => parse(`Quantity,Name\n1,${'a'.repeat(100_000)}`, largeCatalog(1000)));
    expect(result.entries).toEqual([]);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('survives 100k opening parentheses in a name and in deck text', () => {
    const hostile = '('.repeat(100_000);
    const [, csvMs] = timed(() => parse(`Quantity,Name\n1,${hostile}`));
    const [, deckMs] = timed(() => parseDeckText(`1 ${hostile}`, fixture, NOW));
    expect(Math.max(csvMs, deckMs)).toBeLessThan(LIMIT_MS);
    const [split, splitMs] = timed(() => splitParentheticals(`${hostile}x`));
    expect(split.extras).toEqual([]);
    expect(splitMs).toBeLessThan(LIMIT_MS);
  });

  it('splits parentheticals correctly', () => {
    expect(splitParentheticals('Vi (Alternate Art) (Foil)')).toEqual({ base: 'Vi', extras: ['Alternate Art', 'Foil'] });
    expect(splitParentheticals('Vi (unclosed')).toEqual({ base: 'Vi (unclosed', extras: [] });
  });

  it('bounded edit distance agrees with the full one within the bound', () => {
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
    expect(editDistance('kitten', 'sitting', 2)).toBeGreaterThan(2);
    expect(editDistance('abc', 'abc', 0)).toBe(0);
  });
});

describe('backup bounds', () => {
  const base = (): UserData => ({
    owned: [{ id: 'o', updatedAt: 1, printingKey: 'k', finish: 'normal', condition: 'NM', quantity: 1 }],
    taggings: [],
    decks: [],
    savedSearches: [],
  });
  const errorFor = (change: (data: UserData) => void): string => {
    const data = base();
    change(data);
    const result = importBackup(exportBackup(data));
    if (!('error' in result)) throw new Error('expected an error');
    return result.error;
  };

  it('accepts values at the limits', () => {
    const data = base();
    data.owned[0]!.quantity = 9999;
    expect(importBackup(exportBackup(data))).toHaveProperty('data');
  });

  it('rejects out of range quantities, counts, timestamps, strings and lists', () => {
    expect(errorFor((d) => (d.owned[0]!.quantity = 10_000))).toMatch(/owned\[0\]\.quantity/);
    expect(errorFor((d) => (d.owned[0]!.updatedAt = 1e15))).toMatch(/updatedAt/);
    expect(errorFor((d) => (d.owned[0]!.notes = 'n'.repeat(5001)))).toMatch(/notes is longer/);
    expect(errorFor((d) => (d.owned[0]!.printingKey = 'k'.repeat(201)))).toMatch(/printingKey is longer/);
    const deck: Deck = emptyDeck({ main: [{ cardKey: 'c', count: 100 }] });
    expect(errorFor((d) => d.decks.push(deck))).toMatch(/main\[0\]\.count/);
    const tagged = { id: 't', updatedAt: 1, cardKey: 'c', tags: Array.from({ length: 201 }, (_, i) => `t${i}`) };
    expect(errorFor((d) => d.taggings.push(tagged))).toMatch(/more than 200 items/);
    const slots = Array.from({ length: 501 }, (_, i) => ({ cardKey: `c${i}`, count: 1 }));
    expect(errorFor((d) => d.decks.push(emptyDeck({ main: slots })))).toMatch(/more than 500 slots/);
  });

  it('accepts a chosen champion key and rejects a non string one', () => {
    const ok = base();
    ok.decks.push(emptyDeck({ chosenChampionKey: 'vi' }));
    expect(importBackup(exportBackup(ok))).toHaveProperty('data');
    expect(errorFor((d) => d.decks.push(emptyDeck({ chosenChampionKey: 5 as unknown as string })))).toMatch(/chosenChampionKey/);
  });
});

describe('fuzzy matching limits', () => {
  const catalog = largeCatalog(1000);
  const LIMIT_MS = 8000;

  it('caches repeated names and counts only distinct lookups', async () => {
    const { newFuzzySession, fuzzyFindCard } = await import('./matcher');
    const { getCatalogIndex } = await import('./catalogIndex');
    const index = getCatalogIndex(catalog);
    const session = newFuzzySession();
    for (let i = 0; i < 100; i++) fuzzyFindCard(index, 'completely unknown', session);
    expect(session.lookups).toBe(1);
    expect(session.exhausted).toBe(false);
  });

  it('handles 50k unknown rows quickly and says when fuzzy matching was capped', () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => `1,Mystery Card ${i}`).join('\n');
    const start = performance.now();
    const result = parse(`Quantity,Name\n${rows}`, catalog);
    expect(performance.now() - start).toBeLessThan(LIMIT_MS);
    expect(result.rowsRead).toBe(50_000);
    expect(result.issues.some((i) => i.severity === 'warning' && /Fuzzy name matching stopped/.test(i.message))).toBe(true);
  });

  it('handles 5000 unknown deck lines quickly and reports the cap', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `1 Mystery Card ${i}`).join('\n');
    const start = performance.now();
    const { unmatched } = parseDeckText(text, catalog, NOW);
    expect(performance.now() - start).toBeLessThan(LIMIT_MS);
    expect(unmatched.at(-1)).toMatch(/fuzzy name matching stopped/);
  });

  it('still fuzzy matches names that appear after unknown ones, until the cap', () => {
    const name = catalog.cards['big-7']!.name;
    const result = parse(`Quantity,Name\n1,nothing like it\n1,q${name.slice(1)}`, catalog);
    expect(result.entries.map((e) => e.printingKey)).toEqual(['big-0007-standard']);
  });
});

describe('input size and header limits', () => {
  it('maps a very wide, repetitive header in linear time', () => {
    const header = `Quantity,${Array.from({ length: 200_000 }, () => 'Name').join(',')}`;
    const start = performance.now();
    const result = parse(`${header}\n1,${Array.from({ length: 200_000 }, () => "Kai'Sa").join(',')}`);
    expect(performance.now() - start).toBeLessThan(4000);
    expect(result.entries).toHaveLength(1);
  });

  it('rejects oversized CSV input with a clear message', () => {
    const result = parse('x'.repeat(IO_CONFIG.maxInputChars + 1));
    expect(result.entries).toEqual([]);
    expect(result.issues[0]!.message).toMatch(/larger than/);
  });
});
