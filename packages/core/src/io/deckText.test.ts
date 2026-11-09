import { describe, expect, it } from 'vitest';
import type { Deck } from '../types';
import { formatDeckText, parseDeckText } from './deckText';
import { fixtureCatalog } from './testing';

const catalog = fixtureCatalog();
const NOW = 42;

const deck: Deck = {
  id: 'd1',
  updatedAt: 1,
  name: 'Vi Fury',
  legendKey: 'vi-piltover-enforcer',
  main: [{ cardKey: 'vi', count: 1 }, { cardKey: 'stalwart-poro', count: 3 }, { cardKey: 'fury-bolt', count: 2 }],
  runes: [{ cardKey: 'fury-rune', count: 12 }],
  battlefields: [{ cardKey: 'windswept-hillock', count: 1 }],
  sideboard: [{ cardKey: 'kaisa', count: 2 }],
};

const strip = ({ id: _id, updatedAt: _u, ...rest }: Deck) => rest;

describe('formatDeckText', () => {
  it('writes headings and `count name` lines', () => {
    expect(formatDeckText(deck, catalog)).toBe(
      [
        'Deck: Vi Fury',
        '',
        'Legend',
        '1 Vi - Piltover Enforcer',
        '',
        'Main Deck',
        '1 Vi',
        '3 Stalwart Poro',
        '2 Fury Bolt',
        '',
        'Rune Deck',
        '12 Fury Rune',
        '',
        'Battlefields',
        '1 Windswept Hillock',
        '',
        'Sideboard',
        "2 Kai'Sa",
        '',
      ].join('\n'),
    );
  });

  it('omits empty sections and falls back to the card key for unknown cards', () => {
    const text = formatDeckText({ ...deck, legendKey: undefined, runes: [], battlefields: [], sideboard: [], main: [{ cardKey: 'gone', count: 1 }] }, catalog);
    expect(text).toBe('Deck: Vi Fury\n\nMain Deck\n1 gone\n');
  });
});

describe('parseDeckText', () => {
  it('round trips what formatDeckText writes', () => {
    const { deck: parsed, unmatched } = parseDeckText(formatDeckText(deck, catalog), catalog, NOW);
    expect(unmatched).toEqual([]);
    expect(strip(parsed)).toEqual(strip(deck));
    expect(parsed.updatedAt).toBe(NOW);
    expect(parsed.id).not.toBe('');
  });

  it('tolerates case, quantity formats, heading variants, comments and blank lines', () => {
    const text = [
      '// my deck',
      'NAME: Messy',
      '',
      '# a comment',
      'LEGEND:',
      'vi - piltover enforcer',
      '## Main (6)',
      '3x stalwart poro',
      '3 X Stalwart Poro',
      'Fury Bolt x2',
      '\u00d71 Vi',
      'RUNES',
      '12 fury rune // trailing comment',
      'battlefield',
      '1 Windswept Hillock [OGN 290]',
      'SB: 2 Kai\'Sa',
      'Side Board:',
      '1 Stalwart Poro',
    ].join('\r\n');
    const { deck: parsed, unmatched } = parseDeckText(text, catalog, NOW);
    expect(unmatched).toEqual([]);
    expect(parsed.name).toBe('Messy');
    expect(parsed.legendKey).toBe('vi-piltover-enforcer');
    expect(parsed.main).toEqual([
      { cardKey: 'stalwart-poro', count: 6 },
      { cardKey: 'fury-bolt', count: 2 },
      { cardKey: 'vi', count: 1 },
    ]);
    expect(parsed.runes).toEqual([{ cardKey: 'fury-rune', count: 12 }]);
    expect(parsed.battlefields).toEqual([{ cardKey: 'windswept-hillock', count: 1 }]);
    expect(parsed.sideboard).toEqual([{ cardKey: 'kaisa', count: 2 }, { cardKey: 'stalwart-poro', count: 1 }]);
  });

  it('routes runes, battlefields and the legend by card type when no headings are given', () => {
    const { deck: parsed } = parseDeckText('1 Vi - Piltover Enforcer\n3 Stalwart Poro\n12 Fury Rune\n1 Windswept Hillock', catalog, NOW);
    expect(parsed.legendKey).toBe('vi-piltover-enforcer');
    expect(parsed.main).toEqual([{ cardKey: 'stalwart-poro', count: 3 }]);
    expect(parsed.runes).toEqual([{ cardKey: 'fury-rune', count: 12 }]);
    expect(parsed.battlefields).toHaveLength(1);
  });

  it('reports unmatched names, accepts fuzzy typos, and uses a default name', () => {
    const { deck: parsed, unmatched } = parseDeckText('2 Stalwart Porro\n1 Totally Made Up Card\n2 Totally Made Up Card\nBogus', catalog, NOW);
    expect(parsed.main).toEqual([{ cardKey: 'stalwart-poro', count: 2 }]);
    expect(unmatched).toEqual(['Totally Made Up Card', 'Bogus']);
    expect(parsed.name).toBe('Imported deck');
  });

  it('handles empty text and zero quantities without throwing', () => {
    const empty = parseDeckText('', catalog, NOW);
    expect(empty.deck.main).toEqual([]);
    expect(parseDeckText('0 Stalwart Poro', catalog, NOW).deck.main).toEqual([]);
  });

  it('accepts the same legend listed twice', () => {
    const { unmatched } = parseDeckText('Legend\n1 Vi - Piltover Enforcer\n1 Vi - Piltover Enforcer\n', catalog, NOW);
    expect(unmatched).toEqual([]);
  });
});
