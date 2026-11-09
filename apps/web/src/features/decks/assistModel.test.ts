import { describe, expect, it } from 'vitest';
import { suggestFill, validateDeck, type Deck, type DeckIssue } from '@sc/core';
import { applySuggestions, issueFix, missingChampionMarker, realSuggestions } from './assistModel';
import { countOf } from './deckModel';
import { makeTestCatalog, viCollection } from './testCatalog';

const catalog = makeTestCatalog();

function deck(over: Partial<Deck> = {}): Deck {
  return { id: 'd1', name: 'Test', updatedAt: 1, legendKey: 'vi-legend', main: [], runes: [], battlefields: [], sideboard: [], ...over };
}

function issue(code: DeckIssue['code'], cardKey?: string): DeckIssue {
  return { severity: 'error', code, message: code, cardKey };
}

describe('issue fixes', () => {
  it('offers navigation or pickers for structural issues', () => {
    expect(issueFix(issue('no-legend'), catalog)).toMatchObject({ open: 'legend' });
    expect(issueFix(issue('no-champion'), catalog)).toMatchObject({ open: 'champion' });
    expect(issueFix(issue('main-size'), catalog)).toMatchObject({ goto: 'main' });
    expect(issueFix(issue('rune-size'), catalog)).toMatchObject({ goto: 'runes' });
  });

  it('removes an illegal card wherever it sits', () => {
    const fix = issueFix(issue('domain-identity', 'chaos-unit'), catalog);
    const d = deck({ main: [{ cardKey: 'chaos-unit', count: 2 }], sideboard: [{ cardKey: 'chaos-unit', count: 1 }] });
    const next = fix && 'edit' in fix ? fix.edit(d) : d;
    expect(countOf(next, 'main', 'chaos-unit') + countOf(next, 'sideboard', 'chaos-unit')).toBe(0);
  });

  it('trims copies over the limit, sideboard first', () => {
    const fix = issueFix(issue('copy-limit', 'fury-unit-1'), catalog);
    const d = deck({ main: [{ cardKey: 'fury-unit-1', count: 3 }], sideboard: [{ cardKey: 'fury-unit-1', count: 2 }] });
    const next = fix && 'edit' in fix ? fix.edit(d) : d;
    expect(countOf(next, 'main', 'fury-unit-1')).toBe(3);
    expect(countOf(next, 'sideboard', 'fury-unit-1')).toBe(0);
  });

  it('keeps one copy of a duplicated battlefield', () => {
    const fix = issueFix(issue('battlefield-duplicate', 'bf-1'), catalog);
    const next = fix && 'edit' in fix ? fix.edit(deck({ battlefields: [{ cardKey: 'bf-1', count: 2 }] })) : deck();
    expect(countOf(next, 'battlefields', 'bf-1')).toBe(1);
  });
});

describe('fill suggestions', () => {
  it('applies a fill and reduces validation errors', () => {
    const empty = deck();
    const fill = suggestFill(empty, viCollection(), catalog);
    const filled = applySuggestions(empty, catalog, realSuggestions(fill));
    const errors = (d: Deck) => validateDeck(d, catalog).filter((i) => i.severity === 'error').length;
    expect(errors(filled)).toBeLessThan(errors(empty));
    expect(filled.runes.reduce((n, s) => n + s.count, 0)).toBe(12);
    expect(filled.chosenChampionKey).toBe('vi-champ');
  });

  it('flags the missing champion marker when no owned champion fits', () => {
    const fill = suggestFill(deck(), viCollection().filter((row) => !row.printingKey.startsWith('vi-champ')), catalog);
    expect(missingChampionMarker(fill)?.role).toBe('missing-champion');
    expect(realSuggestions(fill).every((s) => s.count > 0)).toBe(true);
  });
});
